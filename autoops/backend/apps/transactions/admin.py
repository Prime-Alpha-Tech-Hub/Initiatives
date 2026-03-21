from django.contrib import admin
from .models import BankFeed, Transaction

@admin.register(BankFeed)
class BankFeedAdmin(admin.ModelAdmin):
    list_display = ['name','institution','feed_type','status','last_synced']

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ['date','description','amount','transaction_type','status']
    list_filter  = ['transaction_type','status']
