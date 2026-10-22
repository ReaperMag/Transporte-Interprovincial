import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.database import import_models
from app.modules.buses.models import BusGroup
from app.modules.cooperatives import repository, service
from app.modules.cooperatives.schemas import CooperativeCreate
from app.shared.base_model import Base


class AdminCooperativeServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import_models()

    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def create_cooperative(self, name: str = "Cooperativa Test", ruc: str = "1234567890001"):
        data = CooperativeCreate(name=name, ruc=ruc)
        return service.create_cooperative(self.db, data.model_dump())

    def test_create_search_and_summary(self) -> None:
        cooperative = self.create_cooperative()

        results = repository.list_cooperatives(self.db, search="Test", is_active=True)
        summary = repository.get_admin_summary(self.db)

        self.assertEqual([cooperative.id], [item.id for item in results])
        self.assertEqual({"cooperatives": 1, "routes": 0, "buses": 0}, summary)

    def test_duplicate_ruc_raises_conflict(self) -> None:
        self.create_cooperative()

        with self.assertRaises(service.DuplicateCooperativeError):
            self.create_cooperative(name="Otra Cooperativa")

    def test_delete_is_blocked_when_cooperative_has_related_data(self) -> None:
        cooperative = self.create_cooperative()
        self.db.add(BusGroup(name="Grupo de buses", cooperative_id=cooperative.id))
        self.db.commit()

        with self.assertRaises(service.CooperativeInUseError):
            service.delete_cooperative(self.db, cooperative.id)

    def test_delete_succeeds_without_related_data(self) -> None:
        cooperative = self.create_cooperative()

        service.delete_cooperative(self.db, cooperative.id)

        self.assertIsNone(repository.get_cooperative(self.db, cooperative.id))


if __name__ == "__main__":
    unittest.main()
