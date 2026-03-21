from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
import threading

from .models import DDAnalysis, RiskFlag, ExtractedFinancial
from .engine import analyse_document
from apps.documents.models import DDDocument


class RiskFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RiskFlag
        fields = '__all__'


class ExtractedFinancialSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ExtractedFinancial
        fields = '__all__'


class DDAnalysisSerializer(serializers.ModelSerializer):
    risk_flags = RiskFlagSerializer(many=True, read_only=True)
    financials = ExtractedFinancialSerializer(read_only=True)
    document_title = serializers.SerializerMethodField()

    class Meta:
        model  = DDAnalysis
        fields = '__all__'

    def get_document_title(self, obj):
        return obj.document.title


class DDAnalysisListSerializer(serializers.ModelSerializer):
    document_title = serializers.SerializerMethodField()
    risk_count     = serializers.SerializerMethodField()

    class Meta:
        model  = DDAnalysis
        fields = ['id', 'document', 'document_title', 'analysis_type', 'status',
                  'tokens_used', 'duration_ms', 'created_at', 'completed_at', 'risk_count']

    def get_document_title(self, obj): return obj.document.title
    def get_risk_count(self, obj):     return obj.risk_flags.count()


def _run_analysis_async(analysis_id: int):
    """Run analysis in background thread."""
    from django.db import connection
    try:
        analysis = DDAnalysis.objects.get(pk=analysis_id)
        document = analysis.document

        analysis.status = 'running'
        analysis.save(update_fields=['status'])

        start = timezone.now()
        result = analyse_document(document, analysis.analysis_type)
        elapsed = int((timezone.now() - start).total_seconds() * 1000)

        tokens = result.pop('tokens_used', 0)

        analysis.result      = result
        analysis.status      = 'complete'
        analysis.tokens_used = tokens
        analysis.duration_ms = elapsed
        analysis.completed_at= timezone.now()
        analysis.save()

        # Update document status
        document.status       = 'complete'
        document.processed_at = timezone.now()
        document.save(update_fields=['status', 'processed_at'])

        # Persist risk flags
        if 'risk' in result:
            _persist_risk_flags(analysis, result['risk'])
        elif analysis.analysis_type == 'risk':
            _persist_risk_flags(analysis, result)

        # Persist financial data
        if 'financial' in result:
            _persist_financials(analysis, result['financial'])
        elif analysis.analysis_type == 'financial':
            _persist_financials(analysis, result)

    except Exception as e:
        import traceback
        try:
            analysis = DDAnalysis.objects.get(pk=analysis_id)
            analysis.status        = 'failed'
            analysis.error_message = f"{e}\n{traceback.format_exc()}"
            analysis.save()
        except Exception:
            pass
    finally:
        connection.close()


def _persist_risk_flags(analysis, risk_data):
    RiskFlag.objects.filter(analysis=analysis).delete()
    flags = risk_data.get('risk_flags', [])
    for f in flags:
        if not isinstance(f, dict):
            continue
        RiskFlag.objects.create(
            analysis    = analysis,
            severity    = f.get('severity', 'medium'),
            category    = f.get('category', 'operational'),
            title       = f.get('title', 'Unnamed flag')[:255],
            detail      = f.get('detail', ''),
            source_text = f.get('source_text', ''),
            mitigation  = f.get('mitigation', ''),
        )


def _persist_financials(analysis, fin_data):
    ExtractedFinancial.objects.filter(analysis=analysis).delete()
    if not fin_data or fin_data.get('parse_error'):
        return

    def safe(key, sub=None):
        d = fin_data.get(sub, fin_data) if sub else fin_data
        val = d.get(key) if isinstance(d, dict) else None
        if val is None:
            return None
        try:
            return float(str(val).replace(',','').replace('%',''))
        except (ValueError, TypeError):
            return None

    is_ = fin_data.get('income_statement', {})
    bs   = fin_data.get('balance_sheet', {})
    cf   = fin_data.get('cash_flow', {})
    rat  = fin_data.get('ratios', {})

    ExtractedFinancial.objects.create(
        analysis         = analysis,
        currency         = fin_data.get('currency', 'USD'),
        period           = fin_data.get('period', ''),
        revenue          = safe('revenue', 'income_statement'),
        gross_profit     = safe('gross_profit', 'income_statement'),
        ebitda           = safe('ebitda', 'income_statement'),
        ebit             = safe('ebit', 'income_statement'),
        net_income       = safe('net_income', 'income_statement'),
        total_assets     = safe('total_assets', 'balance_sheet'),
        total_liabilities= safe('total_liabilities', 'balance_sheet'),
        total_equity     = safe('total_equity', 'balance_sheet'),
        total_debt       = safe('total_debt', 'balance_sheet'),
        cash             = safe('cash', 'balance_sheet'),
        gross_margin     = safe('gross_margin_pct', 'ratios'),
        ebitda_margin    = safe('ebitda_margin_pct', 'ratios'),
        net_margin       = safe('net_margin_pct', 'ratios'),
        debt_to_equity   = safe('debt_to_equity', 'ratios'),
        current_ratio    = safe('current_ratio', 'ratios'),
        historical_data  = fin_data.get('historical_data', []),
        raw_extracted    = fin_data,
    )


class DDAnalysisViewSet(viewsets.ModelViewSet):
    queryset           = DDAnalysis.objects.all().select_related('document')
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['analysis_type', 'status', 'document']

    def get_serializer_class(self):
        return DDAnalysisListSerializer if self.action == 'list' else DDAnalysisSerializer

    @action(detail=False, methods=['post'])
    def run(self, request):
        """Trigger analysis on a document. Runs async in background."""
        doc_id   = request.data.get('document_id')
        atype    = request.data.get('analysis_type', 'full')

        try:
            doc = DDDocument.objects.get(pk=doc_id)
        except DDDocument.DoesNotExist:
            return Response({'error': 'Document not found.'}, status=404)

        if not doc.raw_text:
            return Response({'error': 'Document has no extracted text. Upload and process it first.'}, status=400)

        # Create or reset analysis record
        analysis, created = DDAnalysis.objects.update_or_create(
            document=doc, analysis_type=atype,
            defaults={'status': 'pending', 'result': {}, 'error_message': ''}
        )

        # Run in background thread
        doc.status = 'processing'
        doc.save(update_fields=['status'])

        t = threading.Thread(target=_run_analysis_async, args=(analysis.id,), daemon=True)
        t.start()

        return Response({
            'analysis_id': analysis.id,
            'status':      'pending',
            'message':     f'Analysis started. Poll GET /api/analysis/{analysis.id}/ for results.',
        }, status=202)

    @action(detail=True, methods=['get'])
    def poll(self, request, pk=None):
        """Poll analysis status — lightweight endpoint for frontend polling."""
        a = self.get_object()
        return Response({
            'id':           a.id,
            'status':       a.status,
            'analysis_type':a.analysis_type,
            'completed_at': a.completed_at,
            'error_message':a.error_message if a.status == 'failed' else '',
        })

    @action(detail=False, methods=['get'])
    def by_document(self, request):
        """Get all analyses for a document."""
        doc_id = request.query_params.get('document_id')
        if not doc_id:
            return Response({'error': 'document_id required'}, status=400)
        qs = DDAnalysis.objects.filter(document_id=doc_id).prefetch_related('risk_flags')
        return Response(DDAnalysisSerializer(qs, many=True).data)
