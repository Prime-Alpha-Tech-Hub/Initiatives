from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RecipientViewSet, LPReportViewSet, export_report_pdf, download_report_pdf

router = DefaultRouter()
router.register('recipients', RecipientViewSet, basename='recipient')
router.register('reports',    LPReportViewSet,  basename='report')

urlpatterns = [
    path('', include(router.urls)),
    path('reports/<int:pk>/export_pdf/',   export_report_pdf,   name='report-export-pdf'),
    path('reports/<int:pk>/download_pdf/', download_report_pdf, name='report-download-pdf'),
]
