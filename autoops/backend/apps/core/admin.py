from django.contrib import admin
from .models import AutomationRun

@admin.register(AutomationRun)
class AutomationRunAdmin(admin.ModelAdmin):
    list_display = ['module','task_name','status','records_processed','started_at']
    list_filter  = ['module','status']
    readonly_fields = ['started_at','completed_at']
