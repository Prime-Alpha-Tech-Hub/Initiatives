from rest_framework import serializers, viewsets, permissions, parsers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import IncomingDocument
from .tasks import classify_and_route


class IncomingDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = IncomingDocument
        fields = '__all__'
        read_only_fields = ['status', 'detected_type', 'confidence',
                            'routed_to', 'routed_module', 'received_at', 'processed_at']


class IncomingDocumentViewSet(viewsets.ModelViewSet):
    queryset           = IncomingDocument.objects.all()
    serializer_class   = IncomingDocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filterset_fields   = ['status', 'source', 'routed_module']
    search_fields      = ['filename', 'sender', 'subject', 'detected_type']

    def perform_create(self, serializer):
        doc = serializer.save()
        # Queue for async classification
        classify_and_route.delay(doc.id)

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        doc = self.get_object()
        doc.status = 'received'
        doc.save(update_fields=['status'])
        classify_and_route.delay(doc.id)
        return Response({'message': 'Requeued for processing.'})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = IncomingDocument.objects.all()
        return Response({
            'total': qs.count(),
            'by_status': {s: qs.filter(status=s).count() for s, _ in IncomingDocument.STATUS_CHOICES},
            'by_module': list(qs.values('routed_module').annotate(
                count=__import__('django.db.models', fromlist=['Count']).Count('id')
            )),
        })


from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('', IncomingDocumentViewSet, basename='incoming-doc')
urlpatterns = [path('', include(router.urls))]
