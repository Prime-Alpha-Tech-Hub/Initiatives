from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DiligenceChecklistViewSet, DiligenceItemViewSet, DiligenceFindingViewSet

router = DefaultRouter()
router.register('checklists', DiligenceChecklistViewSet, basename='checklist')
router.register('items',      DiligenceItemViewSet,      basename='dd-item')
router.register('findings',   DiligenceFindingViewSet,   basename='finding')

urlpatterns = [path('', include(router.urls))]
