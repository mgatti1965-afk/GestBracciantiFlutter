import Foundation

protocol HarvestYearRepository {
    func all() -> [HarvestYear]
    func current() -> HarvestYear?
}

protocol WorkerRepository {
    func workersForYear(_ yearId: Int) -> [Worker]
}

protocol WorkLogRepository {
    func logsForYear(_ yearId: Int) -> [WorkLog]
}
