from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PortfolioPositionViewSet, KPIAlertViewSet

router = DefaultRouter()
router.register('positions', PortfolioPositionViewSet, basename='position')
router.register('alerts',    KPIAlertViewSet,          basename='kpi-alert')

urlpatterns = [path('', include(router.urls))]
