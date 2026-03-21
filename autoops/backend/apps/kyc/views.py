from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import KYCRecord
from .tasks import screen_kyc_record


class KYCRecordSerializer(serializers.ModelSerializer):
    documents_complete = serializers.ReadOnlyField()
    class Meta:
        model  = KYCRecord
        fields = '__all__'
        read_only_fields = ['status', 'risk_level', 'sanctions_clear', 'pep_clear',
                            'adverse_media_clear', 'flags', 'screening_notes',
                            'screening_data', 'screened_at', 'approved_at', 'created_at']


class KYCRecordViewSet(viewsets.ModelViewSet):
    queryset           = KYCRecord.objects.all()
    serializer_class   = KYCRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'risk_level', 'entity_type', 'country']
    search_fields      = ['entity_name', 'id_number', 'registration_number']

    def perform_create(self, serializer):
        record = serializer.save()
        screen_kyc_record.delay(record.id)

    @action(detail=True, methods=['post'])
    def rescreen(self, request, pk=None):
        record = self.get_object()
        screen_kyc_record.delay(record.id)
        return Response({'message': f'Re-screening {record.entity_name}.'})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        record = self.get_object()
        record.status      = 'approved'
        record.approved_at = timezone.now()
        record.reviewed_by = request.user.get_full_name()
        record.review_notes= request.data.get('notes', '')
        record.save()
        return Response(KYCRecordSerializer(record).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        record = self.get_object()
        record.status       = 'rejected'
        record.reviewed_by  = request.user.get_full_name()
        record.review_notes = request.data.get('notes', '')
        record.save()
        return Response(KYCRecordSerializer(record).data)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = KYCRecord.objects.all()
        return Response({
            'total':    qs.count(),
            'pending':  qs.filter(status='pending').count(),
            'approved': qs.filter(status='approved').count(),
            'flagged':  qs.filter(status='flagged').count(),
            'expired':  qs.filter(status='expired').count(),
            'high_risk':qs.filter(risk_level__in=['high','critical']).count(),
        })


from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('', KYCRecordViewSet, basename='kyc')
urlpatterns = [path('', include(router.urls))]
