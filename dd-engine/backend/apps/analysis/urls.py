from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DDAnalysisViewSet

router = DefaultRouter()
router.register('', DDAnalysisViewSet, basename='analysis')
urlpatterns = [path('', include(router.urls))]
