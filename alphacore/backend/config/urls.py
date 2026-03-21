from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import FileResponse, HttpResponse, JsonResponse
import os


def serve_spa(request, *args, **kwargs):
    """Serve the React SPA for all non-API routes."""
    spa_index = os.path.join(settings.BASE_DIR, 'staticfiles', 'frontend', 'index.html')
    if os.path.exists(spa_index):
        with open(spa_index, 'rb') as f:
            return HttpResponse(f.read(), content_type='text/html; charset=utf-8')
    return HttpResponse(
        '<h1>Frontend not built</h1>'
        '<p>Run from the <code>alphacore/</code> directory:</p>'
        '<pre>cd frontend && npm run build</pre>',
        status=503
    )


urlpatterns = [
    path('admin/', admin.site.urls),

    # API status
    path('api/', lambda r: JsonResponse({
        'api': 'AlphaCore', 'version': '1.0', 'status': 'running',
        'endpoints': ['/api/accounts/', '/api/deals/', '/api/portfolio/',
                      '/api/documents/', '/api/committee/', '/api/diligence/']
    })),

    # Accounts: auth, onboarding, company, members, join requests
    path('api/accounts/', include('apps.accounts.urls')),

    # Google OAuth (allauth)
    path('api/auth/social/', include('allauth.socialaccount.urls')),

    # AlphaCore modules
    path('api/deals/',      include('apps.deals.urls')),
    path('api/diligence/',  include('apps.diligence.urls')),
    path('api/committee/',  include('apps.committee.urls')),
    path('api/portfolio/',  include('apps.portfolio.urls')),
    path('api/documents/',  include('apps.documents.urls')),
    path('api/core/',       include('apps.core.urls')),

    # React SPA — catch-all, must be last
    re_path(r'^(?!api/|admin/|static/|media/).*$', serve_spa),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
