from django.contrib import admin
from .models import ActivityLog

@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display    = ['user', 'action', 'entity', 'created_at']
    list_filter     = ['entity']
    readonly_fields = ['created_at']
