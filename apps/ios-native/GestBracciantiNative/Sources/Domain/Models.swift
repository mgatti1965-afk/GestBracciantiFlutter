import Foundation

struct HarvestYear: Identifiable {
    let id: Int
    let isCurrent: Bool
    let notes: String
}

struct Worker: Identifiable {
    let id: Int
    let harvestYearId: Int
    let name: String
    let surname: String
    let phoneNumber: String
    let isArchived: Bool
}

struct WorkLog: Identifiable {
    let id: Int
    let workerId: Int
    let harvestYearId: Int
    let date: Date
    let totalHours: Double
    let ordinaryHours: Double
    let extraHours: Double
    let holidayHours: Double
    let totalAmount: Double
    let isManualHoliday: Bool
}
