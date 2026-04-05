from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse, HttpResponse, FileResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
import os


def api_root(request):
    return JsonResponse({
        'service':  'DD Engine',
        'version':  '1.0',
        'initiative': '06 of 15',
        'status':   'running',
        'endpoints': {
            'documents': '/api/documents/',
            'analysis':  '/api/analysis/',
            'reports':   '/api/reports/',
        }
    })


def serve_spa(request, *args, **kwargs):
    index = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
    if os.path.exists(index):
        return HttpResponse(open(index).read(), content_type='text/html')
    return HttpResponse('<h1>Run: ./start.sh to build frontend</h1>', status=503)


_base = [
    path('admin/',          admin.site.urls),
    path('auth/login/',   TokenObtainPairView.as_view(), name='token_obtain'),
    path('auth/refresh/',  TokenRefreshView.as_view(),    name='token_refresh'),
    path('api/',            api_root),
    path('api/documents/',  include('apps.documents.urls')),
    path('api/analysis/',   include('apps.analysis.urls')),
    path('api/reports/',    include('apps.reports.urls')),
    re_path(r'^(?!api/|admin/|static/|media/).*$', serve_spa),
]

urlpatterns = [path("dd/", include(_base))] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
