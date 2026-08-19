import threading
import time
import winsound


class AlarmManager:

    def __init__(self):

        self.running = False
        self.thread = None
        self.lock = threading.Lock()


    def _alarm_loop(self):

        print("🔊 LOUD INDUSTRIAL ALARM STARTED")

        while True:

            with self.lock:

                if not self.running:
                    break

            try:

                # =========================================
                # INDUSTRIAL SIREN PATTERN
                # =========================================

                # High frequency
                winsound.Beep(1800, 400)

                with self.lock:
                    if not self.running:
                        break

                # Lower frequency
                winsound.Beep(900, 400)

                with self.lock:
                    if not self.running:
                        break

                # High frequency
                winsound.Beep(1800, 400)

                with self.lock:
                    if not self.running:
                        break

                # Lower frequency
                winsound.Beep(900, 400)

                # Short pause
                time.sleep(0.15)

            except Exception as error:

                print(
                    "Alarm error:",
                    error
                )

                break


        print("🔇 LOUD INDUSTRIAL ALARM STOPPED")


    def start(self):

        with self.lock:

            if self.running:
                return

            self.running = True


        self.thread = threading.Thread(
            target=self._alarm_loop,
            daemon=True
        )

        self.thread.start()

        print(
            "🚨 PPE ALARM ACTIVATED"
        )


    def stop(self):

        with self.lock:

            self.running = False

        print(
            "🔇 PPE ALARM DEACTIVATED"
        )


    def is_running(self):

        with self.lock:

            return self.running


alarm_manager = AlarmManager()