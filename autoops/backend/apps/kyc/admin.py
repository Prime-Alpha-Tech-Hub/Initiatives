from django.contrib import admin
from .models import KYCRecord

@admin.register(KYCRecord)
class KYCRecordAdmin(admin.ModelAdmin):
    list_display = ['entity_name','entity_type','status','risk_level','screened_at']
    list_filter  = ['status','risk_level','entity_type']
