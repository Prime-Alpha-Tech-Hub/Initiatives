from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DealViewSet, DealNoteViewSet
from apps.core.integration_views import dd_import

router = DefaultRouter()
router.register('',     DealViewSet,     basename='deal')
router.register('notes',DealNoteViewSet, basename='deal-note')

urlpatterns = [path('', include(router.urls)),
    path('<str:deal_id>/dd_import/', dd_import, name='dd-import'),
]
