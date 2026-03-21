from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create all DynamoDB tables for this app (idempotent)"

    def handle(self, *args, **options):
        self.stdout.write("Setting up DynamoDB tables...")
        try:
            from apps.core.dynamo import setup_tables
            setup_tables()
            self.stdout.write(self.style.SUCCESS("All tables ready."))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error: {e}"))
