from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DealViewSet, DealNoteViewSet

router = DefaultRouter()
router.register('',     DealViewSet,     basename='deal')
router.register('notes',DealNoteViewSet, basename='deal-note')

urlpatterns = [path('', include(router.urls))]
