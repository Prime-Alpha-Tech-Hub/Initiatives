from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Pipeline, PipelineRun
from .tasks import run_pipeline, run_all_due_pipelines


class PipelineRunSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PipelineRun
        fields = '__all__'


class PipelineSerializer(serializers.ModelSerializer):
    recent_runs = serializers.SerializerMethodField()
    class Meta:
        model  = Pipeline
        fields = '__all__'
        read_only_fields = ['last_run', 'last_status', 'run_count', 'records_total', 'created_at']

    def get_recent_runs(self, obj):
        return PipelineRunSerializer(obj.runs.order_by('-started_at')[:5], many=True).data


class PipelineViewSet(viewsets.ModelViewSet):
    queryset           = Pipeline.objects.all()
    serializer_class   = PipelineSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields   = ['status', 'schedule', 'source_type']
    search_fields      = ['name', 'description']

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        run_pipeline.delay(pk)
        return Response({'message': 'Pipeline queued.'})

    @action(detail=True, methods=['post'])
    def pause(self, request, pk=None):
        pipeline = self.get_object()
        pipeline.status = 'paused' if pipeline.status == 'active' else 'active'
        pipeline.save(update_fields=['status'])
        return Response(PipelineSerializer(pipeline).data)

    @action(detail=False, methods=['post'])
    def run_all_due(self, request):
        run_all_due_pipelines.delay()
        return Response({'message': 'All due pipelines queued.'})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        from django.db.models import Count
        qs = Pipeline.objects.all()
        return Response({
            'total':        qs.count(),
            'active':       qs.filter(status='active').count(),
            'paused':       qs.filter(status='paused').count(),
            'errored':      qs.filter(status='error').count(),
            'total_runs':   PipelineRun.objects.count(),
            'success_rate': round(
                PipelineRun.objects.filter(status='success').count() /
                max(PipelineRun.objects.count(), 1) * 100, 1
            ),
        })
