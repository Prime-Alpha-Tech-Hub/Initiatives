from django.contrib import admin
from .models import WatchlistEntry, ComplianceAlert

@admin.register(WatchlistEntry)
class WatchlistAdmin(admin.ModelAdmin):
    list_display = ['entity_name','reason','status','added_at']

@admin.register(ComplianceAlert)
class ComplianceAlertAdmin(admin.ModelAdmin):
    list_display = ['title','severity','status','created_at']
    list_filter  = ['severity','status']
