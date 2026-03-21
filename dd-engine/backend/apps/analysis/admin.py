from django.contrib import admin
from .models import DDAnalysis, RiskFlag, ExtractedFinancial

@admin.register(DDAnalysis)
class DDAnalysisAdmin(admin.ModelAdmin):
    list_display  = ["document", "analysis_type", "status", "tokens_used", "duration_ms", "created_at"]
    list_filter   = ["analysis_type", "status"]
    readonly_fields = ["result", "tokens_used", "duration_ms", "created_at", "completed_at"]

@admin.register(RiskFlag)
class RiskFlagAdmin(admin.ModelAdmin):
    list_display  = ["title", "severity", "category", "analysis"]
    list_filter   = ["severity", "category"]

@admin.register(ExtractedFinancial)
class ExtractedFinancialAdmin(admin.ModelAdmin):
    list_display  = ["analysis", "period", "currency", "revenue", "ebitda"]
    readonly_fields = ["raw_extracted", "historical_data"]
