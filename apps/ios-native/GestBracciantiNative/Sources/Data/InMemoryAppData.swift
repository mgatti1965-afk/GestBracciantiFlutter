import Foundation

final class InMemoryAppData: HarvestYearRepository, WorkerRepository, WorkLogRepository {
    private let years: [HarvestYear] = [
        HarvestYear(id: 2026, isCurrent: true, notes: "Annata seed")
    ]

    private let workers: [Worker] = [
        Worker(id: 1, harvestYearId: 2026, name: "Mario", surname: "Rossi", phoneNumber: "", isArchived: false)
    ]

    private let logs: [WorkLog] = [
        WorkLog(
            id: 1,
            workerId: 1,
            harvestYearId: 2026,
            date: Date(timeIntervalSince1970: 1788998400),
            totalHours: 8,
            ordinaryHours: 8,
            extraHours: 0,
            holidayHours: 0,
            totalAmount: 80,
            isManualHoliday: false
        )
    ]

    func all() -> [HarvestYear] {
        years
    }

    func current() -> HarvestYear? {
        years.first(where: { $0.isCurrent })
    }

    func workersForYear(_ yearId: Int) -> [Worker] {
        workers.filter { $0.harvestYearId == yearId }
    }

    func logsForYear(_ yearId: Int) -> [WorkLog] {
        logs.filter { $0.harvestYearId == yearId }
    }
}
