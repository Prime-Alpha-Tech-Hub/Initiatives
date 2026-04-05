from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ActivityLogViewSet
from .integration_views import compliance_event

router = DefaultRouter()
router.register('activity', ActivityLogViewSet, basename='activity')

urlpatterns = [path('', include(router.urls)),
    path('compliance_event/', compliance_event, name='compliance-event'),
]
