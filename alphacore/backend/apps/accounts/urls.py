from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, MeView,
    onboard_create_company, onboard_request_join,
    CompanyViewSet, RoleViewSet, MembershipViewSet, JoinRequestViewSet,
    pas_action_accept, pas_action_reject, relinquish_admin,
    list_api_keys, create_api_key, revoke_api_key,
    list_integrations, save_integration, ping_integration,
)

router = DefaultRouter()
router.register('companies',    CompanyViewSet,    basename='company')
router.register('roles',        RoleViewSet,       basename='role')
router.register('members',      MembershipViewSet, basename='member')
router.register('join-requests',JoinRequestViewSet,basename='join-request')

urlpatterns = [
    # Auth
    path('auth/register/',           RegisterView.as_view(),        name='register'),
    path('auth/login/',              TokenObtainPairView.as_view(), name='login'),
    path('auth/refresh/',            TokenRefreshView.as_view(),    name='refresh'),
    path('auth/me/',                 MeView.as_view(),              name='me'),

    # Onboarding
    path('onboarding/create-company/', onboard_create_company, name='onboard-create'),
    path('onboarding/request-join/',   onboard_request_join,   name='onboard-join'),

    path('', include(router.urls)),

    # PAS token-based email action endpoints — AllowAny, token is the auth
    path('pas-action/accept/<str:token>/', pas_action_accept, name='pas-accept'),
    path('pas-action/reject/<str:token>/', pas_action_reject, name='pas-reject'),

    # Administrator step-down
    path('relinquish-admin/', relinquish_admin, name='relinquish-admin'),

    # Integration API keys
    path('api-keys/',              list_api_keys,   name='api-keys-list'),
    path('api-keys/create/',       create_api_key,  name='api-keys-create'),
    path('api-keys/<int:pk>/revoke/', revoke_api_key, name='api-keys-revoke'),

    # Integration connections
    path('integrations/',          list_integrations, name='integrations-list'),
    path('integrations/save/',     save_integration,  name='integrations-save'),
    path('integrations/<int:pk>/ping/', ping_integration, name='integrations-ping'),

]

