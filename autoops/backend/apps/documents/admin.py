from django.contrib import admin
from .models import IncomingDocument

@admin.register(IncomingDocument)
class IncomingDocumentAdmin(admin.ModelAdmin):
    list_display = ['filename','source','detected_type','status','received_at']
    list_filter  = ['status','source']
