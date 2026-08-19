from backend.alarm_manager import alarm_manager
import time

print("Starting alarm...")
alarm_manager.start()

print("Alarm is running for 10 seconds...")
time.sleep(10)

print("Stopping alarm...")
alarm_manager.stop()

print("Alarm stopped.")

