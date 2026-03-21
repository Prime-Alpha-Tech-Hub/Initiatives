from django.contrib import admin
from .models import DDReport

@admin.register(DDReport)
class DDReportAdmin(admin.ModelAdmin):
    list_display  = ["deal_name", "company_name", "status", "overall_risk_score", "recommendation", "created_at"]
    list_filter   = ["status", "strategy"]
    search_fields = ["deal_name", "company_name"]
    filter_horizontal = ["documents"]
    readonly_fields = ["consolidated_risks", "diligence_gaps", "next_steps", "created_at", "updated_at"]
