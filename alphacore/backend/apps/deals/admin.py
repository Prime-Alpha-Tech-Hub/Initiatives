from django.contrib import admin
from .models import Deal, DealNote, DealStageHistory

@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display  = ['name', 'strategy', 'stage', 'status', 'deal_size', 'lead_analyst', 'updated_at']
    list_filter   = ['strategy', 'stage', 'status']
    search_fields = ['name', 'company_name', 'sector']
    readonly_fields = ['created_at', 'updated_at']

@admin.register(DealNote)
class DealNoteAdmin(admin.ModelAdmin):
    list_display = ['deal', 'author', 'created_at']

@admin.register(DealStageHistory)
class DealStageHistoryAdmin(admin.ModelAdmin):
    list_display = ['deal', 'from_stage', 'to_stage', 'changed_by', 'changed_at']
    readonly_fields = ['changed_at']
