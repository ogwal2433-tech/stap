-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_guardId_siteId_date_key" ON "AttendanceRecord"("guardId", "siteId", "date");
