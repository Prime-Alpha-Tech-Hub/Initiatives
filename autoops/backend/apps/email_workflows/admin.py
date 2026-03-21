from django.contrib import admin
from .models import EmailRule, EmailLog, FollowUpTask

@admin.register(EmailRule)
class EmailRuleAdmin(admin.ModelAdmin):
    list_display = ['name','trigger','action','is_active','match_count']

@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ['sender','subject','status','received_at']

@admin.register(FollowUpTask)
class FollowUpTaskAdmin(admin.ModelAdmin):
    list_display = ['subject','status','due_date','assigned_to']
