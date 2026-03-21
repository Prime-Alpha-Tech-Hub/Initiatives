from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, MeView,
    onboard_create_company, onboard_request_join,
    CompanyViewSet, RoleViewSet, MembershipViewSet, JoinRequestViewSet,
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
]
