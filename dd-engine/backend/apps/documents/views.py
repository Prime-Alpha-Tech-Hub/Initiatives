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
    file_url = serializers.SerializerMethodField()

    def get_file_url(self, obj):
        req = self.context.get('request')
        if obj.file and req:
            return req.build_absolute_uri(obj.file.url)
        return None

    class Meta:
        model  = DDDocument
        fields = ['id', 'title', 'doc_type', 'status', 'deal_id', 'deal_name',
                  'company_name', 'file_size_display', 'page_count', 'file_url',
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


    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Move document to the analyst archive list."""
        from .models import DDDocumentArchive
        doc = self.get_object()
        max_order = DDDocumentArchive.objects.count()
        entry, created = DDDocumentArchive.objects.get_or_create(
            document=doc,
            defaults={
                'sort_order': max_order,
                'group_label': doc.deal_name or doc.company_name or '',
                'archived_by': request.user,
            }
        )
        return Response({'status': 'archived', 'archive_id': entry.id, 'created': created})

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        """Remove document from archive list."""
        from .models import DDDocumentArchive
        doc = self.get_object()
        DDDocumentArchive.objects.filter(document=doc).delete()
        return Response({'status': 'unarchived'})

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


# ── Archive viewset ────────────────────────────────────────────────────────────
from .models import DDDocumentArchive


class DDDocumentArchiveSerializer(serializers.ModelSerializer):
    document_title   = serializers.CharField(source='document.title', read_only=True)
    document_type    = serializers.CharField(source='document.doc_type', read_only=True)
    document_status  = serializers.CharField(source='document.status', read_only=True)
    company_name     = serializers.CharField(source='document.company_name', read_only=True)
    deal_name        = serializers.CharField(source='document.deal_name', read_only=True)
    file_url         = serializers.SerializerMethodField()
    created_at       = serializers.DateTimeField(source='document.created_at', read_only=True)

    class Meta:
        model  = DDDocumentArchive
        fields = '__all__'

    def get_file_url(self, obj):
        req = self.context.get('request')
        if obj.document.file and req:
            return req.build_absolute_uri(obj.document.file.url)
        return None


class DDDocumentArchiveViewSet(viewsets.ModelViewSet):
    queryset           = DDDocumentArchive.objects.select_related('document').all()
    serializer_class   = DDDocumentArchiveSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Accepts [{id: archive_id, sort_order: N}, ...] and bulk-updates order."""
        items = request.data.get('items', [])
        for item in items:
            DDDocumentArchive.objects.filter(pk=item['id']).update(sort_order=item['sort_order'])
        return Response({'status': 'reordered'})

    @action(detail=True, methods=['post'])
    def update_note(self, request, pk=None):
        entry = self.get_object()
        entry.analyst_note = request.data.get('note', '')
        entry.group_label  = request.data.get('group_label', entry.group_label)
        entry.save()
        return Response(DDDocumentArchiveSerializer(entry, context={'request': request}).data)
