from django.contrib import admin
from .models import Pipeline, PipelineRun

@admin.register(Pipeline)
class PipelineAdmin(admin.ModelAdmin):
    list_display = ['name','source_type','schedule','status','run_count','last_run']

@admin.register(PipelineRun)
class PipelineRunAdmin(admin.ModelAdmin):
    list_display = ['pipeline','status','records_fetched','started_at']
    readonly_fields = ['started_at','completed_at']
