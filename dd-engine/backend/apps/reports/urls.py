from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DDReportViewSet

router = DefaultRouter()
router.register('', DDReportViewSet, basename='report')
urlpatterns = [path('', include(router.urls))]
