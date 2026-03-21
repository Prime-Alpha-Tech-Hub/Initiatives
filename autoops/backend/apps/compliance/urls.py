from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WatchlistViewSet, ComplianceAlertViewSet

router = DefaultRouter()
router.register('watchlist', WatchlistViewSet,       basename='watchlist')
router.register('alerts',    ComplianceAlertViewSet, basename='compliance-alert')
urlpatterns = [path('', include(router.urls))]
