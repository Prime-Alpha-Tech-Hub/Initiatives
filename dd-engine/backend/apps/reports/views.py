from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import DDReport
from apps.analysis.models import DDAnalysis, RiskFlag
from apps.documents.models import DDDocument


class DDReportSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()

    class Meta:
        model  = DDReport
        fields = '__all__'

    def get_document_count(self, obj):
        return obj.documents.count()


class DDReportViewSet(viewsets.ModelViewSet):
    queryset           = DDReport.objects.all().prefetch_related('documents')
    serializer_class   = DDReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'deal_id', 'strategy']
    search_fields      = ['deal_name', 'company_name']

    @action(detail=True, methods=['post'])
    def compile(self, request, pk=None):
        """
        Compile report from all linked document analyses.
        Aggregates risk flags, financials, and generates unified summary.
        """
        report = self.get_object()
        docs   = report.documents.all()

        if not docs:
            return Response({'error': 'No documents linked to this report.'}, status=400)

        # Gather all complete analyses
        all_risks   = []
        all_gaps    = []
        all_steps   = []
        fin_summary = []
        max_score   = 0

        for doc in docs:
            analyses = DDAnalysis.objects.filter(document=doc, status='complete')
            for analysis in analyses:
                result = analysis.result

                # Aggregate risk flags
                for flag in RiskFlag.objects.filter(analysis=analysis):
                    all_risks.append({
                        'severity':    flag.severity,
                        'category':    flag.category,
                        'title':       flag.title,
                        'detail':      flag.detail,
                        'source_doc':  doc.title,
                        'mitigation':  flag.mitigation,
                    })

                # Risk score
                if analysis.analysis_type in ('risk', 'full'):
                    risk_data = result.get('risk', result)
                    score = risk_data.get('overall_risk_score', 0)
                    if isinstance(score, (int, float)) and score > max_score:
                        max_score = int(score)
                    all_gaps.extend(risk_data.get('diligence_gaps', []))
                    all_steps.extend(risk_data.get('next_steps', []))

                # Financial summary
                if analysis.analysis_type in ('financial', 'full'):
                    fin_data = result.get('financial', result)
                    if fin_data and not fin_data.get('parse_error'):
                        fin_summary.append(f"[{doc.title}] {fin_data.get('period','')}: "
                                           f"Revenue {fin_data.get('income_statement',{}).get('revenue','N/A')}, "
                                           f"EBITDA {fin_data.get('income_statement',{}).get('ebitda','N/A')}")

        # Sort risks by severity
        sev_order = {'critical':0, 'high':1, 'medium':2, 'low':3, 'info':4}
        all_risks.sort(key=lambda r: sev_order.get(r['severity'], 5))

        # Determine recommendation
        if max_score >= 8:
            rec = 'do_not_proceed'
        elif max_score >= 6:
            rec = 'further_diligence_required'
        elif max_score >= 4:
            rec = 'proceed_with_caution'
        else:
            rec = 'proceed'

        report.consolidated_risks  = all_risks
        report.diligence_gaps      = list(set(all_gaps))
        report.next_steps          = list(set(all_steps))
        report.overall_risk_score  = max_score or None
        report.recommendation      = rec
        report.financial_summary   = '\n'.join(fin_summary)
        report.status              = 'complete'
        report.save()

        return Response(DDReportSerializer(report).data)

    @action(detail=True, methods=['get'])
    def ic_memo_data(self, request, pk=None):
        """Export report as structured IC memo data for AlphaCore."""
        report = self.get_object()
        return Response({
            'deal_id':          report.deal_id,
            'deal_name':        report.deal_name,
            'company_name':     report.company_name,
            'recommendation':   report.recommendation,
            'risk_score':       report.overall_risk_score,
            'executive_summary':report.executive_summary,
            'risk_flags':       report.consolidated_risks,
            'diligence_gaps':   report.diligence_gaps,
            'next_steps':       report.next_steps,
            'documents_reviewed': [d.title for d in report.documents.all()],
        })
