from rest_framework import serializers, viewsets, permissions, parsers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import DDDocument
from .extractor import extract_text


class DDDocumentSerializer(serializers.ModelSerializer):
    file_size_display = serializers.ReadOnlyField()
    uploaded_by_name  = serializers.SerializerMethodField()

    class Meta:
        model  = DDDocument
        fields = '__all__'
        read_only_fields = ['uploaded_by', 'file_size', 'mime_type', 'page_count',
                            'raw_text', 'status', 'created_at', 'updated_at',
                            'processed_at', 'error_message']

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() if obj.uploaded_by else ''


class DDDocumentListSerializer(serializers.ModelSerializer):
    file_size_display = serializers.ReadOnlyField()
    class Meta:
        model  = DDDocument
        fields = ['id', 'title', 'doc_type', 'status', 'deal_id', 'deal_name',
                  'company_name', 'file_size_display', 'page_count',
                  'created_at', 'processed_at']


class DDDocumentViewSet(viewsets.ModelViewSet):
    queryset           = DDDocument.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filterset_fields   = ['doc_type', 'status', 'deal_id']
    search_fields      = ['title', 'company_name', 'deal_name']

    def get_serializer_class(self):
        return DDDocumentListSerializer if self.action == 'list' else DDDocumentSerializer

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        extra = {}
        if file:
            extra['file_size'] = file.size
            extra['mime_type'] = getattr(file, 'content_type', '')
        doc = serializer.save(uploaded_by=self.request.user, **extra)

        # Auto-extract text on upload
        self._extract(doc)

    def _extract(self, doc):
        """Extract text from document and queue for analysis."""
        try:
            text, pages = extract_text(doc.file.path, doc.mime_type)
            doc.raw_text   = text
            doc.page_count = pages
            doc.status     = 'queued'
            doc.save(update_fields=['raw_text', 'page_count', 'status'])
        except Exception as e:
            doc.status        = 'failed'
            doc.error_message = str(e)
            doc.save(update_fields=['status', 'error_message'])

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        """Re-extract text and re-queue for analysis."""
        doc = self.get_object()
        doc.status        = 'uploaded'
        doc.error_message = ''
        doc.save()
        self._extract(doc)
        return Response(DDDocumentSerializer(doc).data)

    @action(detail=True, methods=['get'])
    def text_preview(self, request, pk=None):
        """Return first 2000 chars of extracted text."""
        doc = self.get_object()
        return Response({
            'id':      doc.id,
            'title':   doc.title,
            'preview': doc.raw_text[:2000] if doc.raw_text else '',
            'total_chars': len(doc.raw_text),
        })


# ── URLs ──────────────────────────────────────────────────────────────────────
