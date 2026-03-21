from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(name='pipelines.run_pipeline')
def run_pipeline(pipeline_id: int):
    from .models import Pipeline, PipelineRun
    from apps.core.models import AutomationRun
    core_run = AutomationRun.objects.create(
        module='pipeline', task_name='run_pipeline',
        triggered_by='scheduler', entity_type='pipeline', entity_id=str(pipeline_id)
    )
    pipeline_run = None
    start = timezone.now()
    try:
        pipeline = Pipeline.objects.get(pk=pipeline_id)
        pipeline_run = PipelineRun.objects.create(pipeline=pipeline, status='running')
        import time; time.sleep(0.05)
        elapsed = int((timezone.now() - start).total_seconds() * 1000)
        pipeline_run.status = 'success'
        pipeline_run.duration_ms = elapsed
        pipeline_run.completed_at = timezone.now()
        pipeline_run.log = f"Pipeline \'{pipeline.name}\' executed. Configure source_config for real data."
        pipeline_run.save()
        pipeline.last_run = timezone.now()
        pipeline.last_status = 'success'
        pipeline.run_count += 1
        pipeline.save(update_fields=['last_run', 'last_status', 'run_count'])
        core_run.status = 'success'
        core_run.summary = f"Pipeline \'{pipeline.name}\' ran successfully"
        core_run.duration_ms = elapsed
        core_run.completed_at = timezone.now()
        core_run.save()
    except Exception as e:
        logger.error(f"Pipeline run error: {e}")
        if pipeline_run:
            pipeline_run.status = 'failed'
            pipeline_run.error = str(e)
            pipeline_run.completed_at = timezone.now()
            pipeline_run.save()
        core_run.status = 'failed'
        core_run.error = str(e)
        core_run.completed_at = timezone.now()
        core_run.save()


@shared_task(name='pipelines.run_all_due')
def run_all_due_pipelines():
    from .models import Pipeline
    from apps.core.models import AutomationRun
    from datetime import timedelta
    now    = timezone.now()
    active = Pipeline.objects.filter(status='active').exclude(schedule='manual')
    queued = 0
    for p in active:
        due = False
        if not p.last_run: due = True
        elif p.schedule == 'hourly'  and now - p.last_run > timedelta(hours=1):   due = True
        elif p.schedule == 'daily'   and now - p.last_run > timedelta(days=1):    due = True
        elif p.schedule == 'weekly'  and now - p.last_run > timedelta(weeks=1):   due = True
        elif p.schedule == 'monthly' and now - p.last_run > timedelta(days=30):   due = True
        if due:
            run_pipeline.delay(p.id)
            queued += 1
    AutomationRun.objects.create(
        module='pipeline', task_name='run_all_due',
        triggered_by='scheduler', status='success',
        summary=f"Queued {queued} pipelines",
        records_processed=queued, completed_at=now
    )
