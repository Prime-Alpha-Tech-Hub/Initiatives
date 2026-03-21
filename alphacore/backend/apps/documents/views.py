from rest_framework import serializers, viewsets, permissions, parsers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Document, DocumentVersion, DocumentAccessLog


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    file_size_display= serializers.ReadOnlyField()

    class Meta:
        model  = Document
        fields = '__all__'
        read_only_fields = ['uploaded_by', 'file_size', 'mime_type', 'version',
                            'created_at', 'updated_at']

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else ''


class DocumentVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DocumentVersion
        fields = '__all__'


class DocumentViewSet(viewsets.ModelViewSet):
    queryset           = Document.objects.filter(is_active=True).select_related('uploaded_by', 'deal')
    serializer_class   = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filterset_fields   = ['category', 'deal', 'access_level']
    search_fields      = ['title', 'description']

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        extra = {}
        if file:
            extra['file_size'] = file.size
            extra['mime_type'] = file.content_type
        serializer.save(uploaded_by=self.request.user, **extra)
        # Log access
        DocumentAccessLog.objects.create(
            document=serializer.instance,
            user=self.request.user,
            action='upload',
            ip_address=self.request.META.get('REMOTE_ADDR'),
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        DocumentAccessLog.objects.create(
            document=instance, user=request.user, action='view',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
        return super().retrieve(request, *args, **kwargs)

    @action(detail=True, methods=['post'], parser_classes=[parsers.MultiPartParser])
    def upload_version(self, request, pk=None):
        """Upload a new version of an existing document."""
        document = self.get_object()
        file     = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided.'}, status=400)

        # Archive current version
        DocumentVersion.objects.create(
            document=document, version=document.version,
            file=document.file, uploaded_by=request.user,
            change_note=request.data.get('change_note', ''),
        )
        # Update document
        document.file      = file
        document.file_size = file.size
        document.mime_type = file.content_type
        document.version  += 1
        document.save()
        return Response(DocumentSerializer(document).data)

    @action(detail=False, methods=['get'])
    def repository_stats(self, request):
        from django.db.models import Count, Sum
        docs = Document.objects.filter(is_active=True)
        return Response({
            'total_documents': docs.count(),
            'total_size_bytes': docs.aggregate(s=Sum('file_size'))['s'] or 0,
            'by_category': list(docs.values('category').annotate(count=Count('id'))),
        })


# ── URLs ──────────────────────────────────────────────────────────────────────
from django.urls import path, include
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register('', DocumentViewSet, basename='document')

urlpatterns = [path('', include(router.urls))]
