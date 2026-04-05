from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import KYCRecordViewSet
from .integration_views import kyc_screen, kyc_onboard

router = DefaultRouter()
router.register('', KYCRecordViewSet, basename='kyc')
urlpatterns = [path('', include(router.urls)),
    path('screen/',  kyc_screen,  name='kyc-screen'),
    path('onboard/', kyc_onboard, name='kyc-onboard'),
]
