from django.contrib import admin
from .models import DDDocument

@admin.register(DDDocument)
class DDDocumentAdmin(admin.ModelAdmin):
    list_display  = ["title", "doc_type", "status", "company_name", "deal_name", "file_size_display", "created_at"]
    list_filter   = ["doc_type", "status"]
    search_fields = ["title", "company_name", "deal_name"]
    readonly_fields = ["raw_text", "file_size", "mime_type", "page_count", "created_at", "updated_at", "processed_at"]
