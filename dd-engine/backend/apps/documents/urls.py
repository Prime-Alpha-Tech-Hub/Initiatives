from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DDDocumentViewSet

router = DefaultRouter()
router.register('', DDDocumentViewSet, basename='document')
urlpatterns = [path('', include(router.urls))]
