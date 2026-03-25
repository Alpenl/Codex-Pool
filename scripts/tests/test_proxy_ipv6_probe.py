import importlib.util
import pathlib
import sys
import unittest


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "proxy_ipv6_probe.py"


def load_module():
    spec = importlib.util.spec_from_file_location("proxy_ipv6_probe", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ProxyIpv6ProbeTests(unittest.TestCase):
    def test_expand_username_specs_supports_ranges_and_single_values(self):
        module = load_module()

        self.assertEqual(
            module.expand_username_specs(
                ["f1000000-f1000002", "f1000005", "f1000002-f1000003"]
            ),
            [
                "f1000000",
                "f1000001",
                "f1000002",
                "f1000005",
                "f1000002",
                "f1000003",
            ],
        )

    def test_render_markdown_table_includes_status_ip_and_error_columns(self):
        module = load_module()

        rows = [
            module.ProbeResult(username="f1000000", ok=True, value="2a0c:9a40:1005::449"),
            module.ProbeResult(username="f3000000", ok=False, error="User was rejected"),
        ]

        rendered = module.render_markdown_table(rows)

        self.assertIn("| username | status | value | error |", rendered)
        self.assertIn("| f1000000 | ok | 2a0c:9a40:1005::449 | - |", rendered)
        self.assertIn("| f3000000 | failed | - | User was rejected |", rendered)


if __name__ == "__main__":
    unittest.main()
