from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IncomingDocumentViewSet

router = DefaultRouter()
router.register('', IncomingDocumentViewSet, basename='incoming-doc')
urlpatterns = [path('', include(router.urls))]
