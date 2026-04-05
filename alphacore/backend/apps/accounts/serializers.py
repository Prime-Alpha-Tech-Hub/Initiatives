from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Company, Role, Membership, JoinRequest, UserProfile


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']
        read_only_fields = ['id', 'username']


class UserPublicSerializer(serializers.ModelSerializer):
    """Minimal user info — safe to expose in member lists."""
    full_name = serializers.SerializerMethodField()
    class Meta:
        model  = User
        fields = ['id', 'full_name', 'email']
    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class RoleSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    class Meta:
        model  = Role
        fields = '__all__'
        read_only_fields = ['company', 'is_builtin', 'created_at']
    def get_member_count(self, obj):
        return obj.members.filter(status='active').count()


class CompanySerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    class Meta:
        model  = Company
        fields = '__all__'
        read_only_fields = ['slug', 'created_at', 'updated_at']
    def get_member_count(self, obj):
        return obj.memberships.filter(status='active').count()


class CompanyPublicSerializer(serializers.ModelSerializer):
    """For the join company search — no sensitive data."""
    member_count = serializers.SerializerMethodField()
    class Meta:
        model  = Company
        fields = ['id', 'name', 'slug', 'industry', 'country', 'city', 'logo', 'member_count']
    def get_member_count(self, obj):
        return obj.memberships.filter(status='active').count()


class MembershipSerializer(serializers.ModelSerializer):
    user       = UserPublicSerializer(read_only=True)
    role       = RoleSerializer(read_only=True)
    role_id    = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), write_only=True, source='role'
    )
    role_name  = serializers.SerializerMethodField()
    role_label = serializers.SerializerMethodField()
    user_name  = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()

    class Meta:
        model  = Membership
        fields = ['id', 'user', 'role', 'role_id', 'role_name', 'role_label',
                  'user_name', 'user_email',
                  'status', 'can_approve_members', 'joined_at', 'invited_by']
        read_only_fields = ['user', 'joined_at', 'invited_by']

    def get_role_name(self, obj):
        return obj.role.name if obj.role else None

    def get_role_label(self, obj):
        return obj.role.label if obj.role else None

    def get_user_name(self, obj):
        return obj.user.get_full_name() or obj.user.username if obj.user else None

    def get_user_email(self, obj):
        return obj.user.email if obj.user else None


class JoinRequestSerializer(serializers.ModelSerializer):
    user    = UserPublicSerializer(read_only=True)
    company = CompanyPublicSerializer(read_only=True)
    class Meta:
        model  = JoinRequest
        fields = '__all__'
        read_only_fields = ['user', 'company', 'status', 'reviewed_by',
                            'reviewed_at', 'created_at']


class UserProfileSerializer(serializers.ModelSerializer):
    user              = UserSerializer()
    active_membership = serializers.SerializerMethodField()
    active_company    = CompanySerializer(read_only=True)

    class Meta:
        model  = UserProfile
        fields = ['user', 'avatar', 'phone', 'bio', 'auth_provider',
                  'onboarding_done', 'active_company', 'active_membership', 'created_at']

    def get_active_membership(self, obj):
        m = obj.active_membership
        if not m:
            return None
        return {
            'id':                 m.id,
            'role':               m.role.name if m.role else None,
            'role_name':          m.role.name if m.role else None,
            'role_label':         m.role.label if m.role else None,
            'can_approve_members':m.can_approve_members,
            'permissions':        m.permissions,
            'is_owner':           m.role.name == 'owner' if m.role else False,
            'is_admin':           m.role.name in ('owner','admin') if m.role else False,
            'can_vote_ic':        m.permissions.get('can_vote_ic', False),
        }

    def update(self, instance, validated_data):
        user_data = validated_data.pop('user', {})
        for attr, val in user_data.items():
            setattr(instance.user, attr, val)
        instance.user.save()
        return super().update(instance, validated_data)


class RegisterSerializer(serializers.Serializer):
    email      = serializers.EmailField()
    password   = serializers.CharField(min_length=8, write_only=True)
    first_name = serializers.CharField(max_length=50)
    last_name  = serializers.CharField(max_length=50)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value.lower()

    def create(self, validated_data):
        user = User.objects.create_user(
            username   = validated_data['email'],
            email      = validated_data['email'],
            password   = validated_data['password'],
            first_name = validated_data['first_name'],
            last_name  = validated_data['last_name'],
        )
        UserProfile.objects.create(user=user)
        return user
