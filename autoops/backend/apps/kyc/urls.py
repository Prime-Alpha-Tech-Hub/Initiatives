from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import KYCRecordViewSet

router = DefaultRouter()
router.register('', KYCRecordViewSet, basename='kyc')
urlpatterns = [path('', include(router.urls))]
