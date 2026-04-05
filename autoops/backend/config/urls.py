from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse, HttpResponse
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
import os


def api_root(request):
    return JsonResponse({
        'service': 'AutoOps', 'version': '1.0',
        'initiative': '13 of 15', 'status': 'running',
        'modules': ['documents', 'kyc', 'compliance',
                    'transactions', 'email-workflows', 'pipelines'],
    })


def serve_spa(request, *args, **kwargs):
    index = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
    if os.path.exists(index):
        return HttpResponse(open(index).read(), content_type='text/html')
    return HttpResponse('<h1>Run ./start.sh to build frontend</h1>', status=503)


_base = [
    path('admin/',          admin.site.urls),
    path('auth/login/',     TokenObtainPairView.as_view(), name='login'),
    path('auth/refresh/',   TokenRefreshView.as_view(),    name='refresh'),
    path('api/',            api_root),
    path('api/documents/',  include('apps.documents.urls')),
    path('api/kyc/',        include('apps.kyc.urls')),
    path('api/compliance/', include('apps.compliance.urls')),
    path('api/transactions/',include('apps.transactions.urls')),
    path('api/email/',      include('apps.email_workflows.urls')),
    path('api/pipelines/',  include('apps.pipelines.urls')),
    path('api/core/',       include('apps.core.urls')),
    re_path(r'^(?!api/|admin/|auth/|static/|media/).*$', serve_spa),
]

urlpatterns = [path("ao/", include(_base))] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
