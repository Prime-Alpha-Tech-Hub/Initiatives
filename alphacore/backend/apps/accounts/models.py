from django.db import models
from django.contrib.auth.models import User


# ── Company ───────────────────────────────────────────────────────────────────
class Company(models.Model):
    """One company = one tenant. All data is scoped to a company."""
    name         = models.CharField(max_length=255)
    slug         = models.SlugField(unique=True)  # used in URLs, no domain needed
    description  = models.TextField(blank=True)
    industry     = models.CharField(max_length=100, blank=True)
    website      = models.URLField(blank=True)
    logo         = models.ImageField(upload_to='company_logos/', blank=True, null=True)
    country      = models.CharField(max_length=100, blank=True)
    city         = models.CharField(max_length=100, blank=True)
    founded_year = models.PositiveSmallIntegerField(null=True, blank=True)
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'companies'
        ordering = ['name']

    def __str__(self):
        return self.name


# ── Role ──────────────────────────────────────────────────────────────────────
class Role(models.Model):
    """
    Per-company roles with granular permission flags.
    Built-in roles: owner, admin, pm, analyst, viewer.
    Owners can also create custom roles.
    """
    BUILTIN_ROLES = ['owner', 'admin', 'pm', 'analyst', 'viewer']

    company    = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='roles')
    name       = models.CharField(max_length=50)   # e.g. "analyst", "Senior PM"
    label      = models.CharField(max_length=80)   # display label
    is_builtin = models.BooleanField(default=False)
    is_custom  = models.BooleanField(default=False)
    order      = models.PositiveSmallIntegerField(default=10)

    # ── Permission flags ──────────────────────────────────────────────────────
    # Company management
    can_manage_company  = models.BooleanField(default=False)  # edit company profile
    can_manage_members  = models.BooleanField(default=False)  # approve/remove members
    can_manage_roles    = models.BooleanField(default=False)  # create/edit roles

    # Deal pipeline
    can_view_deals      = models.BooleanField(default=True)
    can_create_deals    = models.BooleanField(default=False)
    can_edit_deals      = models.BooleanField(default=False)
    can_delete_deals    = models.BooleanField(default=False)

    # Due diligence
    can_view_dd         = models.BooleanField(default=True)
    can_edit_dd         = models.BooleanField(default=False)

    # IC workflow
    can_view_ic         = models.BooleanField(default=True)
    can_create_memos    = models.BooleanField(default=False)
    can_vote_ic         = models.BooleanField(default=False)
    can_decide_ic       = models.BooleanField(default=False)  # final approve/reject

    # Portfolio
    can_view_portfolio  = models.BooleanField(default=True)
    can_edit_portfolio  = models.BooleanField(default=False)

    # Documents
    can_view_documents  = models.BooleanField(default=True)
    can_upload_documents= models.BooleanField(default=False)
    can_delete_documents= models.BooleanField(default=False)

    class Meta:
        unique_together = ['company', 'name']
        ordering = ['order']

    def __str__(self):
        return f"{self.company.name} — {self.label}"

    @classmethod
    def create_defaults_for_company(cls, company):
        """Create the 5 built-in roles for a new company."""
        defaults = [
            dict(name='owner',   label='Owner',              order=1,  is_builtin=True,
                 can_manage_company=True, can_manage_members=True, can_manage_roles=True,
                 can_create_deals=True,  can_edit_deals=True,  can_delete_deals=True,
                 can_edit_dd=True, can_create_memos=True, can_vote_ic=True, can_decide_ic=True,
                 can_edit_portfolio=True, can_upload_documents=True, can_delete_documents=True),
            dict(name='admin',   label='Admin',              order=2,  is_builtin=True,
                 can_manage_company=True, can_manage_members=True,
                 can_create_deals=True,  can_edit_deals=True,  can_delete_deals=True,
                 can_edit_dd=True, can_create_memos=True, can_vote_ic=True, can_decide_ic=True,
                 can_edit_portfolio=True, can_upload_documents=True, can_delete_documents=True),
            dict(name='pm',      label='Portfolio Manager',  order=3,  is_builtin=True,
                 can_create_deals=True, can_edit_deals=True,
                 can_edit_dd=True, can_create_memos=True, can_vote_ic=True,
                 can_edit_portfolio=True, can_upload_documents=True),
            dict(name='analyst', label='Analyst',            order=4,  is_builtin=True,
                 can_create_deals=True, can_edit_deals=True,
                 can_edit_dd=True, can_create_memos=True,
                 can_upload_documents=True),
            dict(name='viewer',  label='Viewer (Read-only)', order=5,  is_builtin=True),
        ]
        for d in defaults:
            cls.objects.get_or_create(company=company, name=d['name'], defaults=d)


# ── Membership ────────────────────────────────────────────────────────────────
class Membership(models.Model):
    """Links a user to a company with a specific role."""
    STATUS_CHOICES = [
        ('active',    'Active'),
        ('suspended', 'Suspended'),
        ('removed',   'Removed'),
    ]

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    company    = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='memberships')
    role       = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, related_name='members')
    status     = models.CharField(max_length=15, choices=STATUS_CHOICES, default='active')

    # Delegated privileges
    can_approve_members = models.BooleanField(default=False)  # owner can share this

    joined_at  = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='invited_members')

    class Meta:
        unique_together = ['user', 'company']

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} @ {self.company.name} ({self.role})"

    @property
    def is_owner(self):
        return self.role and self.role.name == 'owner'

    @property
    def permissions(self):
        """Return flat dict of all permission flags from the role."""
        if not self.role:
            return {}
        fields = [f.name for f in Role._meta.get_fields() if f.name.startswith('can_')]
        return {f: getattr(self.role, f) for f in fields}


# ── Join Request ──────────────────────────────────────────────────────────────
class JoinRequest(models.Model):
    """A user requests to join a company. Owner/admin approves or rejects."""
    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('cancelled','Cancelled'),
    ]

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='join_requests')
    company    = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='join_requests')
    message    = models.TextField(blank=True)   # optional note from requester
    status     = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    role       = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)
                                                # role assigned on approval
    reviewed_by= models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='reviewed_requests')
    review_note= models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at= models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['user', 'company']
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} → {self.company.name} [{self.status}]"


# ── User Profile ──────────────────────────────────────────────────────────────
class UserProfile(models.Model):
    """Extended profile. Also tracks onboarding state."""
    AUTH_PROVIDER_CHOICES = [('email', 'Email'), ('google', 'Google')]

    user            = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    avatar          = models.ImageField(upload_to='avatars/', blank=True, null=True)
    phone           = models.CharField(max_length=30, blank=True)
    bio             = models.TextField(blank=True)
    auth_provider   = models.CharField(max_length=10, choices=AUTH_PROVIDER_CHOICES, default='email')
    onboarding_done = models.BooleanField(default=False)  # False = show wizard on first login
    active_company  = models.ForeignKey(Company, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='+')  # last active company
    created_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Profile: {self.user.username}"

    @property
    def active_membership(self):
        if not self.active_company:
            return None
        return Membership.objects.filter(
            user=self.user, company=self.active_company, status='active'
        ).select_related('role').first()
