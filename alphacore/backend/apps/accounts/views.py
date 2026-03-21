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
