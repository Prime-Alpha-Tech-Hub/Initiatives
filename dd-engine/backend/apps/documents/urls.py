from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DDDocumentViewSet, DDDocumentArchiveViewSet
from .integration_views import deal_context, kyc_result

router = DefaultRouter()
router.register('', DDDocumentViewSet, basename='document')
router.register('archive', DDDocumentArchiveViewSet, basename='archive')
urlpatterns = [path('', include(router.urls)),
    path('deal_context/', deal_context, name='deal-context'),
    path('kyc_result/',   kyc_result,   name='kyc-result'),
]
