from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AutomationRunViewSet

router = DefaultRouter()
router.register('runs', AutomationRunViewSet, basename='run')
urlpatterns = [path('', include(router.urls))]
