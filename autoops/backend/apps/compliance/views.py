from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import WatchlistEntry, ComplianceAlert
from .tasks import run_watchlist_screen


class WatchlistEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model  = WatchlistEntry
        fields = '__all__'
        read_only_fields = ['added_at', 'last_checked', 'resolved_at']


class ComplianceAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ComplianceAlert
        fields = '__all__'
        read_only_fields = ['created_at', 'resolved_at']


class WatchlistViewSet(viewsets.ModelViewSet):
    queryset           = WatchlistEntry.objects.all()
    serializer_class   = WatchlistEntrySerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'reason']
    search_fields      = ['entity_name', 'country']

    @action(detail=False, methods=['post'])
    def run_screen(self, request):
        run_watchlist_screen.delay()
        return Response({'message': 'Watchlist screen started.'})


class ComplianceAlertViewSet(viewsets.ModelViewSet):
    queryset           = ComplianceAlert.objects.all()
    serializer_class   = ComplianceAlertSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'severity', 'alert_type']
    search_fields      = ['title', 'entity_name']

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        alert = self.get_object()
        alert.status      = request.data.get('resolution', 'resolved')
        alert.notes       = request.data.get('notes', '')
        alert.resolved_at = timezone.now()
        alert.save()
        return Response(ComplianceAlertSerializer(alert).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = ComplianceAlert.objects.all()
        return Response({
            'open':     qs.filter(status='open').count(),
            'critical': qs.filter(status='open', severity='critical').count(),
            'high':     qs.filter(status='open', severity='high').count(),
            'medium':   qs.filter(status='open', severity='medium').count(),
        })


from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('watchlist', WatchlistViewSet,        basename='watchlist')
router.register('alerts',    ComplianceAlertViewSet,  basename='compliance-alert')
urlpatterns = [path('', include(router.urls))]
