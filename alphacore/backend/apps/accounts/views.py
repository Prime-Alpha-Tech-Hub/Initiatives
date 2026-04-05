from rest_framework import viewsets, permissions, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.utils import timezone
from django.utils.text import slugify
from .models import Company, Role, Membership, JoinRequest, UserProfile
from .serializers import (
    CompanySerializer, CompanyPublicSerializer, RoleSerializer,
    MembershipSerializer, JoinRequestSerializer,
    UserProfileSerializer, RegisterSerializer,
)
import requests as _requests
from django.conf import settings as _settings


# ── Resend email utility ──────────────────────────────────────────────────────
def _send_email(to: str, subject: str, html: str) -> bool:
    """Send via Resend API. Never raises — logs on failure."""
    import logging
    logger = logging.getLogger(__name__)
    api_key = getattr(_settings, 'RESEND_API_KEY', '')
    if not api_key:
        logger.warning('[Resend] RESEND_API_KEY not set — email not sent.')
        return False
    try:
        resp = _requests.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={
                'from':    f'aurel.botouli@primealphasecurities.com',
                'to':      [to],
                'subject': subject,
                'html':    html,
            },
            timeout=8,
        )
        data = resp.json()
        if resp.ok and data.get('id'):
            logger.info(f'[Resend] Sent to {to} — ID: {data["id"]}')
            return True
        logger.warning(f'[Resend] Failed: {data}')
        return False
    except Exception as e:
        logger.error(f'[Resend] Exception: {e}')
        return False


def _pas_email_html(title: str, body: str, cta_text: str = '', cta_url: str = '') -> str:
    cta = f'''<div style="margin-top:20px"><a href="{cta_url}" style="background:#c9a84c;color:#000;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">{cta_text}</a></div>''' if cta_text else ''
    return f'''<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;margin:0">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #ddd">
  <div style="background:#07090f;padding:18px 24px;border-bottom:3px solid #c9a84c">
    <div style="font-size:10px;color:#c9a84c;letter-spacing:.18em;text-transform:uppercase;margin-bottom:4px">Prime Alpha Securities</div>
    <h1 style="color:#fff;font-size:17px;margin:0;font-weight:700">{title}</h1>
  </div>
  <div style="padding:22px 24px">
    <div style="font-size:13px;color:#444;line-height:1.75">{body}</div>
    {cta}
    <p style="font-size:11px;color:#aaa;margin-top:22px;border-top:1px solid #eee;padding-top:12px">Prime Alpha Securities · Confidential · Do not forward</p>
  </div>
</div></body></html>'''


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}


def get_membership(user, company=None):
    """Return user's active membership, optionally for a specific company."""
    qs = Membership.objects.filter(user=user, status='active').select_related('role', 'company')
    if company:
        return qs.filter(company=company).first()
    profile = getattr(user, 'profile', None)
    if profile and profile.active_company:
        return qs.filter(company=profile.active_company).first()
    return qs.first()


def can_manage_members(user, company):
    m = get_membership(user, company)
    if not m:
        return False
    return m.can_approve_members or (m.role and (m.role.can_manage_members or m.role.name == 'owner'))


# ── Registration ──────────────────────────────────────────────────────────────
class RegisterView(generics.CreateAPIView):
    serializer_class   = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        return Response({
            'tokens': get_tokens(user),
            'user':   {'id': user.id, 'email': user.email, 'first_name': user.first_name},
            'onboarding_done': False,
        }, status=status.HTTP_201_CREATED)


# ── Me / Profile ──────────────────────────────────────────────────────────────
class MeView(generics.RetrieveUpdateAPIView):
    serializer_class   = UserProfileSerializer
    # Accept both JWT and session auth (session needed for Google OAuth callback)
    authentication_classes = [
        __import__('rest_framework_simplejwt.authentication',
                   fromlist=['JWTAuthentication']).JWTAuthentication,
        __import__('rest_framework.authentication',
                   fromlist=['SessionAuthentication']).SessionAuthentication,
    ]
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(
            user=self.request.user,
            defaults={'auth_provider': 'google' if hasattr(self.request.user, 'socialaccount_set') else 'email'}
        )
        return profile

    def retrieve(self, request, *args, **kwargs):
        """
        On Google OAuth callback the user has a Django session but no JWT.
        Issue fresh JWT tokens alongside the profile data.
        """
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework.response import Response
        instance   = self.get_object()
        serializer = self.get_serializer(instance)
        data       = serializer.data

        # Always include fresh tokens so frontend can store them
        refresh = RefreshToken.for_user(request.user)
        data['tokens'] = {
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
        }
        return Response(data)


# ── Onboarding ────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def onboard_create_company(request):
    """
    Owner path: user creates a new company.
    Creates the company, all default roles, and sets user as owner.
    """
    name = request.data.get('name', '').strip()
    if not name:
        return Response({'error': 'Company name is required.'}, status=400)

    # Generate unique slug
    base_slug = slugify(name)
    slug = base_slug
    n = 1
    while Company.objects.filter(slug=slug).exists():
        slug = f"{base_slug}-{n}"; n += 1

    company = Company.objects.create(
        name        = name,
        slug        = slug,
        industry    = request.data.get('industry', ''),
        country     = request.data.get('country', ''),
        city        = request.data.get('city', ''),
        description = request.data.get('description', ''),
        website     = request.data.get('website', ''),
    )

    # Create default roles
    Role.create_defaults_for_company(company)

    # Assign owner role
    owner_role = Role.objects.get(company=company, name='owner')
    membership = Membership.objects.create(
        user    = request.user,
        company = company,
        role    = owner_role,
        status  = 'active',
        can_approve_members = True,
    )

    # Mark profile as onboarded, set active company
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.active_company  = company
    profile.onboarding_done = True
    profile.save()

    return Response({
        'company':    CompanySerializer(company).data,
        'membership': MembershipSerializer(membership).data,
    }, status=201)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def onboard_request_join(request):
    """
    Worker path: user requests to join an existing company.
    """
    company_id = request.data.get('company_id')
    message    = request.data.get('message', '')

    # ── Company not found → send request to PAS ─────────────────────────────
    company_name_req = request.data.get('company_name', '').strip()
    if not company_id and company_name_req:
        requester_name = request.user.get_full_name() or request.user.email
        _send_email(
            to='ir@primealphasecurities.com',
            subject=f'[AlphaCore] New company onboarding request — {company_name_req}',
            html=_pas_email_html(
                title='New company onboarding request',
                body=(f'<strong>{requester_name}</strong> ({request.user.email}) has requested '
                      f'access to AlphaCore for a company not yet in the database.<br><br>'
                      f'Company name: <strong>{company_name_req}</strong><br><br>'
                      f'Log in to the AlphaCore admin panel to add this company and set the administrator.'),
            ),
        )
        _send_email(
            to=request.user.email,
            subject=f'[AlphaCore] Company request received — {company_name_req}',
            html=_pas_email_html(
                title='Company request received',
                body=(f'Your request to add <strong>{company_name_req}</strong> to AlphaCore '
                      f'has been sent to Prime Alpha Securities.<br><br>'
                      f'We will set up your company and notify you by email once your account is ready.'),
            ),
        )
        return Response({'status': 'pending_pas_review', 'company_name': company_name_req}, status=202)

    try:
        company = Company.objects.get(pk=company_id, is_active=True)
    except Company.DoesNotExist:
        return Response({'error': 'Company not found.'}, status=404)

    # Check not already a member
    if Membership.objects.filter(user=request.user, company=company, status='active').exists():
        return Response({'error': 'You are already a member of this company.'}, status=400)

    # Check no pending request
    existing = JoinRequest.objects.filter(user=request.user, company=company).first()
    if existing and existing.status == 'pending':
        return Response({'error': 'You already have a pending request for this company.'}, status=400)

    jr = JoinRequest.objects.update_or_create(
        user=request.user, company=company,
        defaults={'status': 'pending', 'message': message, 'reviewed_by': None, 'reviewed_at': None}
    )[0]

    # Mark profile onboarding done (user is pending — they see a waiting screen)
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    profile.onboarding_done = True
    profile.active_company  = company
    profile.save()

    # ── Email company admins who can approve ──────────────────────────────────
    approvers = Membership.objects.filter(
        company=company, status='active', can_approve_members=True
    ).select_related('user')
    requester_name = request.user.get_full_name() or request.user.email
    for approver in approvers:
        _send_email(
            to=approver.user.email,
            subject=f'[AlphaCore] Access request — {requester_name}',
            html=_pas_email_html(
                title='New access request',
                body=(f'<strong>{requester_name}</strong> ({request.user.email}) has requested '
                      f'access to <strong>{company.name}</strong> on AlphaCore.<br><br>'
                      f'Message: {message or "(none)"}<br><br>'
                      f'Log in to AlphaCore and go to <strong>Members → Pending requests</strong> to approve or reject.'),
            ),
        )

    # ── Also notify requester ─────────────────────────────────────────────────
    _send_email(
        to=request.user.email,
        subject=f'[AlphaCore] Request submitted — {company.name}',
        html=_pas_email_html(
            title='Access request submitted',
            body=(f'Your request to join <strong>{company.name}</strong> has been submitted.<br><br>'
                  f'You will receive an email once an administrator reviews your request.<br><br>'
                  f'In the meantime you can close this browser tab.'),
        ),
    )

    return Response(JoinRequestSerializer(jr).data, status=201)


# ── Company ───────────────────────────────────────────────────────────────────
class CompanyViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        # Public search uses minimal serializer
        if self.action in ['search', 'list']:
            return CompanyPublicSerializer
        return CompanySerializer

    def get_queryset(self):
        return Company.objects.filter(is_active=True)

    def get_object(self):
        """Restrict editing to own company only."""
        obj = super().get_object()
        if self.action not in ['retrieve', 'search']:
            m = get_membership(self.request.user, obj)
            if not m or not m.role or not m.role.can_manage_company:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You do not have permission to edit this company.")
        return obj

    @action(detail=False, methods=['get'])
    def search(self, request):
        """Public company search for the join flow."""
        q = request.query_params.get('q', '').strip()
        qs = Company.objects.filter(is_active=True)
        if q:
            qs = qs.filter(name__icontains=q)
        return Response(CompanyPublicSerializer(qs[:20], many=True).data)

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """Return the user's active company."""
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.active_company:
            return Response(None)
        return Response(CompanySerializer(profile.active_company).data)


# ── Roles ─────────────────────────────────────────────────────────────────────
class RoleViewSet(viewsets.ModelViewSet):
    serializer_class   = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        m = get_membership(self.request.user)
        if not m:
            return Role.objects.none()
        return Role.objects.filter(company=m.company)

    def perform_create(self, serializer):
        m = get_membership(self.request.user)
        if not m or not m.role or not m.role.can_manage_roles:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only owners and admins can create roles.")
        serializer.save(company=m.company, is_custom=True)


# ── Members ───────────────────────────────────────────────────────────────────
class MembershipViewSet(viewsets.ModelViewSet):
    serializer_class   = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        m = get_membership(self.request.user)
        if not m:
            return Membership.objects.none()
        return Membership.objects.filter(
            company=m.company, status='active'
        ).select_related('user', 'role')

    @action(detail=True, methods=['post'])
    def change_role(self, request, pk=None):
        target = self.get_object()
        m = get_membership(request.user, target.company)
        if not m or not m.role or not m.role.can_manage_members:
            return Response({'error': 'Permission denied.'}, status=403)

        role_id = request.data.get('role_id')
        try:
            role = Role.objects.get(pk=role_id, company=target.company)
        except Role.DoesNotExist:
            return Response({'error': 'Role not found.'}, status=404)

        # Can't change owner's role unless you are the owner
        if target.role and target.role.name == 'owner' and not m.is_owner:
            return Response({'error': 'Only the owner can reassign the owner role.'}, status=403)

        target.role = role
        target.save()
        return Response(MembershipSerializer(target).data)

    @action(detail=True, methods=['post'])
    def delegate_approval(self, request, pk=None):
        """Owner delegates 'approve members' privilege to a member."""
        target = self.get_object()
        caller = get_membership(request.user, target.company)
        if not caller or not caller.is_owner:
            return Response({'error': 'Only the owner can delegate approval rights.'}, status=403)
        target.can_approve_members = request.data.get('can_approve', True)
        target.save()
        return Response(MembershipSerializer(target).data)

    @action(detail=True, methods=['post'])
    def remove_member(self, request, pk=None):
        target = self.get_object()
        caller = get_membership(request.user, target.company)
        if not caller or not can_manage_members(request.user, target.company):
            return Response({'error': 'Permission denied.'}, status=403)
        if target.role and target.role.name == 'owner':
            return Response({'error': 'Cannot remove the owner.'}, status=403)
        target.status = 'removed'
        target.save()
        return Response({'removed': True})


# ── Join Requests ─────────────────────────────────────────────────────────────
class JoinRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class   = JoinRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        m = get_membership(self.request.user)
        if m and can_manage_members(self.request.user, m.company):
            # Approvers see all pending requests for their company
            return JoinRequest.objects.filter(
                company=m.company, status='pending'
            ).select_related('user', 'company')
        # Others see their own requests
        return JoinRequest.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        jr = JoinRequest.objects.get(pk=pk)
        m  = get_membership(request.user, jr.company)
        if not m or not can_manage_members(request.user, jr.company):
            return Response({'error': 'Permission denied.'}, status=403)

        # Determine role — default to analyst
        role_name = request.data.get('role', 'analyst')
        try:
            role = Role.objects.get(company=jr.company, name=role_name)
        except Role.DoesNotExist:
            role = Role.objects.filter(company=jr.company, name='analyst').first()

        # Create membership
        membership, _ = Membership.objects.update_or_create(
            user=jr.user, company=jr.company,
            defaults={'role': role, 'status': 'active', 'invited_by': request.user}
        )

        # Update profile
        profile, _ = UserProfile.objects.get_or_create(user=jr.user)
        profile.active_company = jr.company
        profile.save()

        jr.status      = 'approved'
        jr.reviewed_by = request.user
        jr.reviewed_at = timezone.now()
        jr.role        = role
        jr.review_note = request.data.get('note', '')
        jr.save()

        # Email the approved user
        _send_email(
            to=jr.user.email,
            subject=f'[AlphaCore] Access approved — {jr.company.name}',
            html=_pas_email_html(
                title='Access approved',
                body=(f'Your request to join <strong>{jr.company.name}</strong> has been approved.<br><br>'
                      f'Your role: <strong>{role.label}</strong><br><br>'
                      f'{f"Note from approver: {jr.review_note}<br><br>" if jr.review_note else ""}'
                      f'You can now log in to AlphaCore and access your company workspace.'),
            ),
        )

        return Response({
            'join_request': JoinRequestSerializer(jr).data,
            'membership':   MembershipSerializer(membership).data,
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        jr = JoinRequest.objects.get(pk=pk)
        if not can_manage_members(request.user, jr.company):
            return Response({'error': 'Permission denied.'}, status=403)
        jr.status      = 'rejected'
        jr.reviewed_by = request.user
        jr.reviewed_at = timezone.now()
        jr.review_note = request.data.get('note', '')
        jr.save()

        # Email the rejected user
        _send_email(
            to=jr.user.email,
            subject=f'[AlphaCore] Access request update — {jr.company.name}',
            html=_pas_email_html(
                title='Access request not approved',
                body=(f'Your request to join <strong>{jr.company.name}</strong> was not approved.<br><br>'
                      f'{f"Note: {jr.review_note}<br><br>" if jr.review_note else ""}'
                      f'If you believe this is an error, contact your company administrator.'),
            ),
        )
        return Response(JoinRequestSerializer(jr).data)

    @action(detail=False, methods=['get'])
    def pending_count(self, request):
        """Quick badge count for notification dot in UI."""
        m = get_membership(request.user)
        if not m or not can_manage_members(request.user, m.company):
            return Response({'count': 0})
        count = JoinRequest.objects.filter(company=m.company, status='pending').count()
        return Response({'count': count})

    @action(detail=False, methods=['get'])
    def my_status(self, request):
        """Worker checks if their join request was approved/rejected."""
        profile = getattr(request.user, 'profile', None)
        if not profile or not profile.active_company:
            return Response({'status': 'no_request'})
        jr = JoinRequest.objects.filter(
            user=request.user, company=profile.active_company
        ).order_by('-created_at').first()
        if not jr:
            return Response({'status': 'no_request'})
        return Response({
            'status':      jr.status,
            'company':     jr.company.name,
            'review_note': jr.review_note,
        })



# ── PAS token-based request handling ─────────────────────────────────────────
PAS_EMAIL = 'it@alphasecurities.com'


def _base_url(request):
    from django.conf import settings as _s
    override = getattr(_s, 'ALPHACORE_BASE_URL', '')
    if override:
        return override.rstrip('/')
    return f"{request.scheme}://{request.get_host()}"


def _handle_new_company_request(request, company_name):
    """
    User requested a company not in the DB.
    Creates a PASRequest, emails PAS with one-click Accept/Reject links.
    No login, no admin panel — the token IS the authentication.
    """
    pas_req = PASRequest.objects.create(
        user=request.user,
        request_type='new_company',
        company_name_requested=company_name,
    )

    base = _base_url(request)
    accept_url = f"{base}/alphacore/api/accounts/pas-action/accept/{pas_req.accept_token}/"
    reject_url = f"{base}/alphacore/api/accounts/pas-action/reject/{pas_req.reject_token}/"

    requester_name = request.user.get_full_name() or request.user.email
    action_row = (
        f'<div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap">'
        f'<a href="{accept_url}" style="background:#22d3a0;color:#000;padding:10px 22px;'
        f'border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">Accept — create company</a>'
        f'<a href="{reject_url}" style="background:#ef4444;color:#fff;padding:10px 22px;'
        f'border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">Reject</a></div>'
    )

    _send_email(
        to=PAS_EMAIL,
        subject=f'[AlphaCore] New company request — {company_name}',
        html=_pas_email_html(
            title='New company onboarding request',
            body=(
                f'<strong>{requester_name}</strong> ({request.user.email}) has requested '
                f'access to AlphaCore for a company not yet in the database.<br><br>'
                f'Company name: <strong>{company_name}</strong><br><br>'
                f'Click Accept to create the company and set this user as administrator.<br>'
                f'Click Reject to decline. <strong>Links expire in 7 days.</strong>'
                f'{action_row}'
            ),
        ),
    )
    _send_email(
        to=request.user.email,
        subject=f'[AlphaCore] Company request received — {company_name}',
        html=_pas_email_html(
            title='Company request received',
            body=(
                f'Your request to add <strong>{company_name}</strong> to AlphaCore '
                f'has been sent to Prime Alpha Securities.<br><br>'
                f'You will receive an email once reviewed.'
            ),
        ),
    )
    return Response({
        'status': 'pending_pas_review',
        'company_name': company_name,
        'request_id': pas_req.pk,
    }, status=202)


def _token_html(title, body, success, neutral=False):
    from django.http import HttpResponse
    color = '#22d3a0' if success else ('#f59e0b' if neutral else '#ef4444')
    icon  = 'OK' if success else ('--' if neutral else 'X')
    html  = (
        '<!DOCTYPE html><html><head><meta charset="UTF-8">'
        f'<title>AlphaCore — {title}</title>'
        '<style>body{font-family:system-ui,sans-serif;background:#07090f;color:#dde4f5;'
        'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}'
        '.box{background:#0d1117;border:1px solid #1e2540;border-radius:12px;padding:40px 48px;'
        'max-width:480px;text-align:center}'
        f'.ic{{font-size:48px;margin-bottom:16px;color:{color}}}'
        'h1{font-size:20px;font-weight:700;margin-bottom:12px}'
        'p{font-size:14px;color:#64748b;line-height:1.7}'
        '.pas{margin-top:24px;font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase}'
        '</style></head><body><div class="box">'
        f'<div class="ic">{icon}</div>'
        f'<h1>{title}</h1>'
        f'<p>{body}</p>'
        '<div class="pas">Prime Alpha Securities &middot; AlphaCore</div>'
        '</div></body></html>'
    )
    return HttpResponse(html, content_type='text/html', status=200)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def pas_action_accept(request, token):
    """
    GET /api/accounts/pas-action/accept/<token>/
    PAS clicks this link to accept the request.
    Token is the only authentication — no login needed.
    """
    from django.utils import timezone
    from django.utils.text import slugify

    try:
        pas_req = PASRequest.objects.select_related('user', 'company').get(
            accept_token=token, status='pending'
        )
    except PASRequest.DoesNotExist:
        return _token_html('Already used', 'This link has already been used or does not exist.', False)

    if pas_req.is_expired:
        pas_req.status = 'expired'
        pas_req.save()
        return _token_html('Link expired', 'This link expired after 7 days. The user must resubmit.', False)

    user = pas_req.user

    if pas_req.request_type == 'new_company':
        # Create company — first user becomes owner automatically
        name = pas_req.company_name_requested
        base_slug = slugify(name)
        slug = base_slug
        n = 1
        while Company.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{n}'
            n += 1
        company = Company.objects.create(name=name, slug=slug, is_active=True)
        Role.create_defaults_for_company(company)
        owner_role = Role.objects.get(company=company, name='owner')
        membership = Membership.objects.create(
            user=user, company=company, role=owner_role,
            status='active', can_approve_members=True,
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.active_company = company
        profile.onboarding_done = True
        profile.save()

        pas_req.company = company
        pas_req.status = 'accepted'
        pas_req.actioned_at = timezone.now()
        pas_req.save()

        _send_email(
            to=user.email,
            subject=f'[AlphaCore] Your workspace is ready — {name}',
            html=_pas_email_html(
                title='Your AlphaCore workspace is ready',
                body=(
                    f'Prime Alpha Securities has approved your request.<br><br>'
                    f'<strong>{name}</strong> is now live on AlphaCore. '
                    f'You have been set as <strong>Owner / Administrator</strong>.<br><br>'
                    f'Log in to AlphaCore to access your workspace and invite your team.'
                ),
            ),
        )
        return _token_html(
            f'Accepted — {name}',
            f'Company <strong>{name}</strong> created. '
            f'{user.email} is now the administrator and has been notified.',
            True,
        )

    elif pas_req.request_type == 'join_company':
        company = pas_req.company
        if not company:
            return _token_html('Error', 'No company linked to this request.', False)

        # If no active members yet, make them owner. Otherwise analyst.
        has_members = Membership.objects.filter(company=company, status='active').exists()
        role_name = 'owner' if not has_members else 'analyst'
        role = Role.objects.filter(company=company, name=role_name).first()
        membership, _ = Membership.objects.update_or_create(
            user=user, company=company,
            defaults={
                'role': role, 'status': 'active',
                'can_approve_members': role_name == 'owner',
            },
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.active_company = company
        profile.onboarding_done = True
        profile.save()

        JoinRequest.objects.filter(
            user=user, company=company, status='pending'
        ).update(status='approved', reviewed_at=timezone.now())

        pas_req.status = 'accepted'
        pas_req.actioned_at = timezone.now()
        pas_req.save()

        role_label = role.label if role else 'Analyst'
        _send_email(
            to=user.email,
            subject=f'[AlphaCore] Access approved — {company.name}',
            html=_pas_email_html(
                title='Access approved',
                body=(
                    f'Your request to join <strong>{company.name}</strong> has been approved.<br><br>'
                    f'Your role: <strong>{role_label}</strong><br><br>'
                    f'Log in to AlphaCore to access your workspace.'
                ),
            ),
        )
        return _token_html(
            f'Accepted — {company.name}',
            f'{user.email} added to <strong>{company.name}</strong> as <strong>{role_label}</strong> and notified.',
            True,
        )

    return _token_html('Unknown request type', '', False)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def pas_action_reject(request, token):
    """
    GET /api/accounts/pas-action/reject/<token>/
    PAS clicks this link to reject the request.
    """
    from django.utils import timezone

    try:
        pas_req = PASRequest.objects.select_related('user', 'company').get(
            reject_token=token, status='pending'
        )
    except PASRequest.DoesNotExist:
        return _token_html('Already used', 'This link has already been used or does not exist.', False, neutral=True)

    if pas_req.is_expired:
        pas_req.status = 'expired'
        pas_req.save()
        return _token_html('Link expired', 'This link expired after 7 days.', False, neutral=True)

    user   = pas_req.user
    note   = request.query_params.get('note', '')
    entity = pas_req.company_name_requested or (pas_req.company.name if pas_req.company else 'your request')

    pas_req.status = 'rejected'
    pas_req.actioned_at = timezone.now()
    pas_req.pas_note = note
    pas_req.save()

    if pas_req.company:
        JoinRequest.objects.filter(
            user=user, company=pas_req.company, status='pending'
        ).update(status='rejected', reviewed_at=timezone.now())

    _send_email(
        to=user.email,
        subject=f'[AlphaCore] Access request update — {entity}',
        html=_pas_email_html(
            title='Access request not approved',
            body=(
                f'Your AlphaCore request for <strong>{entity}</strong> '
                f'was not approved by Prime Alpha Securities.<br><br>'
                f'{f"Note: {note}<br><br>" if note else ""}'
                f'Questions? Contact us at {PAS_EMAIL}.'
            ),
        ),
    )
    return _token_html(
        f'Rejected — {entity}',
        f'Request from {user.email} rejected. They have been notified.',
        False,
        neutral=True,
    )


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def relinquish_admin(request):
    """
    POST /api/accounts/relinquish-admin/
    The current owner/admin steps down.
    Blocked if they are the only administrator — the company cannot be left without one.
    """
    company_id = request.data.get('company_id')
    profile    = getattr(request.user, 'profile', None)
    if company_id:
        try:
            company = Company.objects.get(pk=company_id)
        except Company.DoesNotExist:
            return Response({'error': 'Company not found.'}, status=404)
    elif profile and profile.active_company:
        company = profile.active_company
    else:
        return Response({'error': 'No active company.'}, status=400)

    m = get_membership(request.user, company)
    if not m or not m.role or m.role.name not in ('owner', 'admin'):
        return Response({'error': 'You are not an administrator of this company.'}, status=403)

    # Must leave at least one other owner/admin
    other_admins = Membership.objects.filter(
        company=company, status='active', role__name__in=['owner', 'admin']
    ).exclude(user=request.user)

    if not other_admins.exists():
        return Response({
            'error': (
                'You are the only administrator. '
                'Promote another member to admin or owner before stepping down.'
            )
        }, status=400)

    analyst_role = Role.objects.filter(company=company, name='analyst').first()
    if not analyst_role:
        return Response({'error': 'Analyst role not found.'}, status=500)

    m.role = analyst_role
    m.can_approve_members = False
    m.save()

    return Response({
        'detail':   f'You have stepped down. Your new role is {analyst_role.label}.',
        'new_role': analyst_role.name,
    })



# ── Integration API Key views ─────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_api_keys(request):
    """List all API keys for the user's company (prefix only, no hash)."""
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    keys = IntegrationAPIKey.objects.filter(
        company=m.company, is_active=True
    ).values('id', 'name', 'prefix', 'scope', 'created_at', 'last_used_at')
    return Response(list(keys))


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def create_api_key(request):
    """
    POST { name, scope }
    Returns the raw key ONCE. It is never retrievable again.
    """
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    if not m.role or m.role.name not in ('owner', 'admin'):
        return Response({'error': 'Only owners and admins can create API keys.'}, status=403)
    name  = request.data.get('name', '').strip()
    scope = request.data.get('scope', 'all')
    if not name:
        return Response({'error': 'Key name is required.'}, status=400)
    instance, raw_key = IntegrationAPIKey.generate(
        company=m.company, name=name, scope=scope, created_by=request.user
    )
    return Response({
        'id':      instance.pk,
        'name':    instance.name,
        'prefix':  instance.prefix,
        'scope':   instance.scope,
        'raw_key': raw_key,   # shown ONCE — client must store it
        'warning': 'This key will not be shown again. Copy it now.',
        'created_at': instance.created_at.isoformat(),
    }, status=201)


@api_view(['DELETE'])
@permission_classes([permissions.IsAuthenticated])
def revoke_api_key(request, pk):
    """Revoke (deactivate) an API key."""
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    try:
        key = IntegrationAPIKey.objects.get(pk=pk, company=m.company)
    except IntegrationAPIKey.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    key.is_active = False
    key.save()
    return Response({'revoked': True})


# ── Integration Connection views ──────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def list_integrations(request):
    """List all integration connections for the user's company."""
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    conns = IntegrationConnection.objects.filter(company=m.company)
    data = [{
        'id':         c.pk,
        'initiative': c.initiative,
        'label':      c.label or dict(IntegrationConnection.INITIATIVE_CHOICES).get(c.initiative, c.initiative),
        'base_url':   c.base_url,
        'is_active':  c.is_active,
        'ping_ok':    c.ping_ok,
        'last_ping':  c.last_ping.isoformat() if c.last_ping else None,
    } for c in conns]
    return Response(data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def save_integration(request):
    """
    POST { initiative, base_url, api_key_raw, label }
    Upsert an integration connection.
    """
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    initiative = request.data.get('initiative')
    base_url   = request.data.get('base_url', '').strip().rstrip('/')
    api_key    = request.data.get('api_key_raw', '').strip()
    label      = request.data.get('label', '').strip()
    if not initiative:
        return Response({'error': 'initiative is required.'}, status=400)
    conn, _ = IntegrationConnection.objects.update_or_create(
        company=m.company, initiative=initiative,
        defaults={
            'base_url':    base_url,
            'api_key_raw': api_key,
            'label':       label,
            'is_active':   bool(base_url),
        }
    )
    return Response({
        'id':         conn.pk,
        'initiative': conn.initiative,
        'base_url':   conn.base_url,
        'is_active':  conn.is_active,
        'ping_ok':    conn.ping_ok,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def ping_integration(request, pk):
    """
    POST to /integrations/{pk}/ping/
    Attempts GET {base_url}/health/ and records the result.
    """
    from django.utils import timezone as _tz
    import requests as _r
    m = get_membership(request.user)
    if not m:
        return Response({'error': 'No active company.'}, status=400)
    try:
        conn = IntegrationConnection.objects.get(pk=pk, company=m.company)
    except IntegrationConnection.DoesNotExist:
        return Response({'error': 'Not found.'}, status=404)
    if not conn.base_url:
        return Response({'error': 'No base URL configured.'}, status=400)
    try:
        resp = _r.get(f'{conn.base_url}/health/', timeout=5)
        conn.ping_ok = resp.status_code < 400
    except Exception:
        conn.ping_ok = False
    conn.last_ping = _tz.now()
    conn.save(update_fields=['ping_ok', 'last_ping'])
    return Response({'ping_ok': conn.ping_ok, 'last_ping': conn.last_ping.isoformat()})

# ── Google OAuth signal — auto-create UserProfile on social login ─────────────
from django.dispatch import receiver
from allauth.socialaccount.signals import social_account_added, pre_social_login
from allauth.socialaccount.models import SocialLogin
from allauth.account.models import EmailAddress


@receiver(pre_social_login)
def handle_social_login(sender, request, sociallogin, **kwargs):
    """
    When a user signs in with Google:
    1. If their email already exists, connect to that account
    2. Auto-create UserProfile if it doesn't exist
    """
    email = sociallogin.account.extra_data.get('email', '')
    if not email:
        return

    # Connect to existing account with same email
    try:
        existing = User.objects.get(email__iexact=email)
        if not sociallogin.is_existing:
            sociallogin.connect(request, existing)
    except User.DoesNotExist:
        pass


from django.db.models.signals import post_save
from django.dispatch import receiver as signal_receiver

@signal_receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Auto-create UserProfile when a new User is created (incl. via Google OAuth)."""
    if created:
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={'auth_provider': 'email'}
        )
